import fs from 'fs';

const adminData = JSON.parse(fs.readFileSync('src/data/mille_e_una_notte_quiz_admin.json', 'utf-8'));
const publicData = {
    quizName: adminData.quizName,
    version: adminData.version,
    questions: adminData.questions.map(({ correctAnswers, points, speedBonus, ...rest }) => rest)
};

fs.writeFileSync('public/data/mille_e_una_notte_quiz.json', JSON.stringify(publicData, null, 2));
console.log('✅ public/data/mille_e_una_notte_quiz.json generato correttamente!');