
import React from "react";
import { LucideProps } from "lucide-react";

// You can add more icon components as needed based on your requirements
export const Icons = {
  // Define your custom icons here
  Logo: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  // Add more icons as needed
};

export const ScootLogo: React.FC<React.SVGProps<SVGSVGElement> & { className?: string }> = (props) => {
  const { className, ...rest } = props;
  return (
    <img 
      src="/assets/white_on_transparent_scoot.png" 
      alt="Scoot Logo" 
      className={className || "h-8 w-auto"} 
      {...rest}
    />
  );
};

export default Icons;
export { ScootLogo };
