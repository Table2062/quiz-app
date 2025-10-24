import React from 'react';

type TrimmedInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    onValueChange?: (value: string) => void;
};

export default function TrimmedInput({ onValueChange, onChange, ...props }: TrimmedInputProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const trimmedValue = e.target.value.trimStart(); // evita spazi iniziali mentre scrivi
        e.target.value = trimmedValue;
        if (onValueChange) onValueChange(trimmedValue.trim());
        if (onChange) onChange(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        // trim completo quando si lascia il campo
        const target = e.target as HTMLInputElement;
        target.value = target.value.trim();
        if (onChange) onChange(e);
    };

    return <input {...props} onChange={handleChange} onBlur={handleBlur} />;
}