import fs from 'fs';

const adminData = JSON.parse(fs.readFileSync('src/data/sanremo_2026_quiz_admin.json', 'utf-8'));
const publicData = {
    quizName: adminData.quizName,
    version: adminData.version,
    questions: adminData.questions.map(({ correctAnswers, points, speedBonus, ...rest }) => rest)
};

fs.writeFileSync('public/data/sanremo_2026_quiz.json', JSON.stringify(publicData, null, 2));
console.log('✅ public/data/sanremo_2026_quiz.json generato correttamente!');