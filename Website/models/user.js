const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: String, // Leave empty for Google-authenticated users
  picture: String,  // Profile picture from Google (optional)
  provider: String  // 'google' or 'local'
});

module.exports = mongoose.model("User", userSchema);
