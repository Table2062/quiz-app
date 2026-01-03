import fs from 'fs';

const adminData = JSON.parse(fs.readFileSync('src/data/funeral_2025_quiz_admin.json', 'utf-8'));
const publicData = {
    quizName: adminData.quizName,
    version: adminData.version,
    questions: adminData.questions.map(({ correctAnswers, points, speedBonus, ...rest }) => rest)
};

fs.writeFileSync('public/data/funeral_2025_quiz.json', JSON.stringify(publicData, null, 2));
console.log('✅ public/data/funeral_2025_quiz.json generato correttamente!');