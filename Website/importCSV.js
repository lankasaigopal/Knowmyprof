const mongoose = require("mongoose");
const csv = require("csvtojson");
const Professor = require("./models/professor");
require("dotenv").config(); // To load your .env file

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

csv()
  .fromFile("FinalGrade_Adjusted_Dataset.csv")
  .then(async (data) => {
    const professorsMap = {};

    // Group grades by professor
    // Group grades by professor
    data.forEach(row => {
      const profId = row.Professor_ID.trim(); // ✅ read from CSV
      const profName = row.Professor_Name.trim();
      const grade = parseFloat(row.Final_Grade);

      if (!professorsMap[profId]) {
          professorsMap[profId] = { name: profName, grades: [] };
      }
      professorsMap[profId].grades.push(grade);
    });


    // Store in DB with average
    // for (let name in professorsMap) {
    //     const grades = professorsMap[name];
    //     const avg = grades.reduce((a, b) => a + b, 0) / grades.length;

    //     await Professor.create({
    //         name,
    //         final_grades: grades,
    //         average_rating: parseFloat(avg.toFixed(2))
    //     });
    // }

    for (let profId in professorsMap) {
      const { name, grades } = professorsMap[profId];
      const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
  
      await Professor.create({
          prof_id: profId, // ✅ Save the actual P001, etc.
          name,
          final_grades: grades,
          average_rating: parseFloat(avg.toFixed(2))
      });
  }
  

    console.log("✅ Professors inserted into DB");
    process.exit();
  })
  .catch(err => {
    console.error("❌ Import failed:", err);
    process.exit(1);
  });
