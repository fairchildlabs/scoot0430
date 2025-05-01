import { SVGProps } from "react";

interface HandMetalIconProps extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

// Custom HandMetal icon component to mimic the appearance in Scoot(34)
export const HandMetalIcon = ({ filled, ...props }: HandMetalIconProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Index finger extended upward */}
      <path 
        d="M12.5,3.5 L12.5,11" 
        strokeWidth={filled ? "0" : "2"}
        fill={filled ? "currentColor" : "none"}
      />
      
      {/* Pinky finger extended upward */}
      <path 
        d="M6,5 L6,11" 
        strokeWidth={filled ? "0" : "2"}
        fill={filled ? "currentColor" : "none"}
      />
      
      {/* Thumb sticking out */}
      <path 
        d="M16,10 C17.5,10 18,11 18.5,12" 
        strokeWidth={filled ? "0" : "2"}
        fill={filled ? "currentColor" : "none"}
      />
      
      {/* Palm/hand */}
      <path 
        d="M6,11 C6,11 5,14 9,14 C13,14 13,14 16,14 C19,14 19,11 19,11 L19,18 C19,19.5 17.5,21 15,21 L10,21 C7.5,21 6,19.5 6,18 L6,11"
        strokeWidth={filled ? "0" : "2"}
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
};