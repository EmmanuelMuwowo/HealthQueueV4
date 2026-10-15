require('dotenv').config();

const u = process.env.AT_USERNAME || '';
const k = process.env.AT_API_KEY || '';

console.log('Username  :', JSON.stringify(u));
console.log('Key length:', k.length);
console.log('Starts with:', k.slice(0, 5));
console.log('Only letters/digits/underscore:', /^[A-Za-z0-9_]+$/.test(k));