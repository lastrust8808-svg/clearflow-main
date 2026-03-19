import React from 'react';

interface LogoProps {
  height?: number;
}

export const Logo: React.FC<LogoProps> = ({ height = 40 }) => {
  return (
    <div style={{ height: `${height}px` }} className="inline-block">
      <svg viewBox="0 0 420 100" preserveAspectRatio="xMinYMid meet" className="h-full w-auto" aria-label="Clear-Flow Logo">
        <g transform="translate(50, 50)">
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="50%" stopColor="#005A9E"/>
              <stop offset="50%" stopColor="#4CAF50"/>
            </linearGradient>
            <clipPath id="circleClip">
              <circle cx="0" cy="0" r="48"/>
            </clipPath>
          </defs>
          <g clipPath="url(#circleClip)">
            <rect x="-50" y="-50" width="100" height="100" fill="url(#logoGradient)"/>
            <path d="M -45, -18 C -20, -42, 25, 12, 45, -8" stroke="white" strokeWidth="11" strokeLinecap="round" fill="none"/>
            <path d="M -45, 18 C -25, 42, 15, -18, 45, 8" stroke="white" strokeWidth="11" strokeLinecap="round" fill="none"/>
          </g>
        </g>
        <text x="112" y="70" fontFamily="'Saira', sans-serif" fontWeight="700" fontStyle="italic" fontSize="54" letterSpacing="-2">
          <tspan fill="#005A9E">Clear-</tspan>
          <tspan fill="#4CAF50">Flow</tspan>
        </text>
      </svg>
    </div>
  );
};
