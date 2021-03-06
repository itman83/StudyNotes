var _ = require('underscore')
var async = require('async')
var config = require('../config')
var debug = require('debug')('studynotes:routes/pro')
var email = require('../lib/email')
var model = require('../model')
var ssl = require('../lib/ssl')
var secret = require('../secret')

var stripe = require('stripe')(secret.stripe.secret)
stripe.setApiVersion('2013-12-03')

module.exports = function (app) {

  app.post('/pro', ssl.ensureSSL, function (req, res, next) {
    var amount = config.proPrice
    var user = req.user

    async.auto({
      essay: function (cb) {
        model.Essay
        .findOne({ _id: req.body.referringEssay })
        .exec(cb)
      },

      stripeCharge: ['essay', function (cb) {
        // wait until after essay task is fetched so that we can redirect back
        // to essay if there is an error
        var charge = stripe.charges.create({
          amount: amount, // in cents
          currency: 'usd',
          card: req.body.stripeToken,
          description: 'StudyNotes Pro (' + req.body.stripeEmail + ')'
        }, cb)
      }],

      order: ['stripeCharge', function (cb, r) {
        var order = new model.Order({
          stripeEmail: req.body.stripeEmail,
          stripeToken: req.body.stripeToken,
          amount: amount,
          referringEssay: r.essay,
          freeEssays: req.session.free,
          stripeCharge: JSON.stringify(r.stripeCharge)
        })

        order.save(function (err, order) {
          cb(err, order)
        })
      }],

      // Is there a registered user with the same email used for Stripe?
      // If so, we want them to encourage them to link their account by
      // redirecting to login page. They are still free to sign up for a new
      // account if they want.
      linkedUser: ['order', function (cb, r) {
        if (req.isAuthenticated())
          return cb(null, req.user)

        model.User
          .findOne({ email: r.order.stripeEmail })
          .exec(cb)
      }]

    }, function (err, r) {
      if (err) {
        console.error(err)
        if (err.type === 'StripeCardError') {
          req.flash('error', 'Your card has been declined. Please try again!')
          console.error('Card declined')
          console.error(err)
          return res.redirect((r.essay && r.essay.url) || 'back')
        } else if (err.errors) {
          // errors from mongoose validation
          _(err.errors).each(function (error) {
            req.flash('error', error.message)
          })
          return res.redirect((r.essay && r.essay.url) || 'back')
        } else {
          return next(err)
        }
      }

      // User is officially Pro now
      req.session.pro = {
        email: r.order.stripeEmail,
        orderId: r.order.id
      }

      // Redirect to original essay after signup/login
      req.session.returnTo = r.essay.url

      if (r.linkedUser) {
        // Already logged in users will go straight to the essay via `returnTo`
        res.redirect('/login/')
      } else {
        res.redirect('/signup/')
      }
      email.notifyAdmin('New order for $' + (amount / 100), r.order)
    })
  })
}
