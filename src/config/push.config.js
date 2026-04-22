const webpush = require('web-push');
const logger = require('../utils/logger');

// VAPID keys should ideally be in .env. 
// v83.0: Generated for immediate implementation. 
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BOviwaoubgZngyc_I9usdbR37cldjChsfiwNR0e0Q9-ouTOSszKa8aeWbO_ezYM2ppwgGsHyxoRBWVRS4g0jmcw';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'B5wXkJac4CnCosc_KouoEVFDgPYi7Nk8NWEWtcz3O40';

webpush.setVapidDetails(
    'mailto:du.solmates@gmail.com',
    publicVapidKey,
    privateVapidKey
);

logger.info('Web-Push VAPID details configured');

module.exports = {
    webpush,
    publicVapidKey
};
