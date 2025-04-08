const mongoose = require("mongoose");

const professorSchema = new mongoose.Schema({
    prof_id: String,
    name: String,
    final_grades: [Number], // Array of final grades
    average_rating: Number  // Pre-computed average grade
});

module.exports = mongoose.model("Professor", professorSchema);
