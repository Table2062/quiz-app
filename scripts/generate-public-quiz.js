import fs from 'fs';

const adminData = JSON.parse(fs.readFileSync('src/data/xmas_quiz_admin.json', 'utf-8'));
const publicData = {
    quizName: adminData.quizName,
    version: adminData.version,
    questions: adminData.questions.map(({ correctAnswers, points, speedBonus, ...rest }) => rest)
};

fs.writeFileSync('public/data/xmas_quiz.json', JSON.stringify(publicData, null, 2));
console.log('✅ public/data/xmas_quiz.json generato correttamente!');