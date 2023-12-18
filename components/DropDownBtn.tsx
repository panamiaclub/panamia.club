import React, { useState } from 'react';
import PanaButton from './PanaButton';
import styles from './DropDownBtn.module.css';

type DropDownBtnProps = {
  title: string;
  color: 'blue' | 'pink' | 'yellow' | 'navy' | 'gray';
  hoverColor?: 'blue' | 'pink' | 'yellow' | 'navy' | 'gray';
  dropdown: React.ReactNode;
  type: 'button' | 'submit' | 'reset';
  onClick?: () => void;
};

const DropDownBtn: React.FC<DropDownBtnProps> = ({ title, color, hoverColor, dropdown, type, onClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleButtonClick = () => {
    setIsOpen(!isOpen);
    if (onClick) {
      onClick();
    }
  };

  return (
    <div>
      <PanaButton 
        text={title} 
        color={color} 
        hoverColor={hoverColor}
        onClick={handleButtonClick}
        type={type}
      />
      {isOpen && (
        <div className={styles.DropDownBtn}>
          {dropdown}
        </div>
      )}
    </div>
  );
};

export default DropDownBtn;