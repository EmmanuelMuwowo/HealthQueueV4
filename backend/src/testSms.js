require('dotenv').config();
const { sendSms, registrationMessage } = require('./services/smsService');

(async () => {
  const phone = process.argv[2];
  if (!phone) {
    console.log('Usage: node src/testSms.js +260977000001');
    return;
  }
  const message = registrationMessage({
    token_number: 'GOP-004',
    service_point: 'General Outpatient',
    patients_ahead: 3,
    ewt_minutes: 24,
  });
  console.log('Sending:', message);
  const result = await sendSms(phone, message);
  console.log(JSON.stringify(result, null, 2));
})();