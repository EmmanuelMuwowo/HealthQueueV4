require('dotenv').config();

(async () => {
  const user = process.env.AT_USERNAME;
  const key = process.env.AT_API_KEY || '';
  console.log('Key starts with:', key.slice(0, 5), '| ends with:', key.slice(-3));

  const url = `https://api.sandbox.africastalking.com/version1/user?username=${encodeURIComponent(user)}`;
  try {
    const res = await fetch(url, { headers: { apiKey: key, Accept: 'application/json' } });
    const text = await res.text();
    console.log('HTTP status:', res.status);
    console.log(text.slice(0, 300));
  } catch (err) {
    console.log('Request failed:', err.message);
  }
})();