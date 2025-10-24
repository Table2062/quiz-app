export interface Question {
    id: number;
    type: string;
    question: string;
    options: string[];
    correctAnswers?: number[]; // solo lato admin
    timeLimit: number;
    audioPath?: string;
}

export interface QuestionProps {
    question: Question;
    onAnswer: (answer: any) => void;
    disabled?: boolean;
}