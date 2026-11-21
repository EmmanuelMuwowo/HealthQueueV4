// Password rule (security requirement SR2): at least 8 characters,
// with at least one letter and one digit, and not the same as the username.
const passwordProblem = (password, username = '') => {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use both letters and numbers.';
  if (username && password.toLowerCase() === String(username).toLowerCase()) {
    return 'The password cannot be the same as the username.';
  }
  return null;
};

module.exports = { passwordProblem };
