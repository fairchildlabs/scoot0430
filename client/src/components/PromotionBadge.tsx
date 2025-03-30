import React from 'react';

interface PromotionBadgeProps {
  checkinType?: string;
}

/**
 * A component for displaying consistent promotion badges
 * Can handle checkin types in formats:
 * - Simple string: 'win_promoted', 'loss_promoted', 'autoup'
 * - Team encoded: 'win_promoted:1', 'loss_promoted:2'
 * - Team with designation: 'win_promoted:1:H', 'loss_promoted:2:A'
 */
export const PromotionBadge: React.FC<PromotionBadgeProps> = ({ checkinType }) => {
  if (!checkinType) return null;
  
  // Helper function to parse checkin_type
  const parseCheckinType = (type: string = '') => {
    if (!type.includes(':')) return { baseType: type };
    
    const parts = type.split(':');
    return {
      baseType: parts[0],
      teamNumber: parts[1],
      teamDesignation: parts.length >= 3 ? parts[2] : ''
    };
  };
  
  const { baseType, teamDesignation } = parseCheckinType(checkinType);
  
  // Choose appropriate styling and text based on promotion type
  if (baseType === 'win_promoted') {
    return (
      <span className="ml-2 text-sm text-green-400">
        (WP{teamDesignation ? `-${teamDesignation}` : ''})
      </span>
    );
  } else if (baseType === 'loss_promoted') {
    return (
      <span className="ml-2 text-sm text-yellow-400">
        (LP{teamDesignation ? `-${teamDesignation}` : ''})
      </span>
    );
  } else if (baseType === 'autoup') {
    return (
      <span className="ml-2 text-sm text-blue-400">
        (Autoup)
      </span>
    );
  }
  
  return null;
};

export default PromotionBadge;