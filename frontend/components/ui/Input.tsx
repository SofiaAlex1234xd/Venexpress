import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onRightIconClick?: () => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, icon, rightIcon, onRightIconClick, className = '', ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {icon && (
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        className={`
              w-full rounded-lg sm:rounded-xl border-2 border-gray-200 px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-gray-900 
              placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 
              focus:ring-blue-100 transition-all duration-200 outline-none
              ${icon ? 'pl-10 sm:pl-12' : ''}
              ${rightIcon ? 'pr-10 sm:pr-12' : ''}
              ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : ''}
              ${className}
            `}
                        {...props}
                    />
                    {rightIcon && (
                        <div
                            className={`absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 ${onRightIconClick ? 'cursor-pointer hover:text-gray-600' : 'pointer-events-none'}`}
                            onClick={onRightIconClick}
                        >
                            {rightIcon}
                        </div>
                    )}
                </div>
                {error && (
                    <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                        {error}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export default Input;
