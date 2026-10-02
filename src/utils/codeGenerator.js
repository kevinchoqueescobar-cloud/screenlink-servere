/**
 * Generates a random 6-character uppercase alphanumeric code (excluding easily confused characters like O, 0, I, 1)
 */
function generateSessionCode(length = 6) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars.charAt(randomIndex);
  }
  return result;
}

module.exports = {
  generateSessionCode
};
