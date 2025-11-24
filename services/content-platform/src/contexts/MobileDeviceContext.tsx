import React, { createContext, useContext, ReactNode } from 'react';

interface MobileDeviceContextType {
  // Context would contain shared state for mobile device management
  // For now, this is a minimal implementation to satisfy the tests
}

const MobileDeviceContext = createContext<MobileDeviceContextType | undefined>(undefined);

interface MobileDeviceProviderProps {
  children: ReactNode;
}

export const MobileDeviceProvider: React.FC<MobileDeviceProviderProps> = ({ children }) => {
  const value: MobileDeviceContextType = {
    // Minimal context implementation
  };

  return (
    <MobileDeviceContext.Provider value={value}>
      {children}
    </MobileDeviceContext.Provider>
  );
};

export const useMobileDeviceContext = () => {
  const context = useContext(MobileDeviceContext);
  if (context === undefined) {
    throw new Error('useMobileDeviceContext must be used within a MobileDeviceProvider');
  }
  return context;
};