import fs from 'fs';

const adminData = JSON.parse(fs.readFileSync('src/data/quiz2_admin.json', 'utf-8'));
const publicData = {
    quizName: adminData.quizName,
    version: adminData.version,
    questions: adminData.questions.map(({ correctAnswers, points, speedBonus, ...rest }) => rest)
};

fs.writeFileSync('public/data/quiz2.json', JSON.stringify(publicData, null, 2));
console.log('✅ public/data/quiz2.json generato correttamente!');