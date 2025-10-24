import MultipleChoiceQuestion from '@/components/questions/MultipleChoiceQuestion';
import MultipleSelectQuestion from '@/components/questions/MultipleSelectQuestion';
import OrderingQuestion from '@/components/questions/OrderingQuestion';
import MatchingQuestion from '@/components/questions/MatchingQuestion';
import AudioMultipleChoiceQuestion from '@/components/questions/AudioMultipleChoiceQuestion';
import { Question, QuestionProps } from '@/types/QuestionProps';

export function renderQuestion(question: Question, props: Omit<QuestionProps, 'question'>) {
    switch (question.type) {
        case 'MULTIPLE_CHOICE':
            return <MultipleChoiceQuestion question={question} {...props} />;
        case 'MULTIPLE_SELECT':
            return <MultipleSelectQuestion question={question} {...props} />;
        case 'ORDERING':
            return <OrderingQuestion question={question} {...props} />;
        case 'MATCHING':
            return <MatchingQuestion question={question} {...props} />;
        case 'AUDIO_MULTIPLE_CHOICE':
            return <AudioMultipleChoiceQuestion question={question} {...props} />;
        default:
            return <p>Tipo di domanda non supportato.</p>;
    }
}