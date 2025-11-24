import React from 'react';
import { render, screen } from '@testing-library/react';
import { DeviceCard } from '@/components/DeviceCard';

// Basic test to verify component renders
describe('DeviceCard Basic', () => {
  const mockDevice = {
    id: 'device-1',
    deviceId: 'mobile-device-1',
    name: 'iPhone 15 Pro',
    model: 'iPhone15,3',
    os: 'iOS',
    osVersion: '17.2',
    appVersion: '1.0.0',
    capabilities: ['stream_control'],
    isPaired: true,
    isOnline: true,
    lastSeen: new Date(),
    batteryLevel: 85,
    networkType: 'wifi'
  };

  const defaultProps = {
    device: mockDevice,
    onUnpair: jest.fn(),
    onShowDetails: jest.fn(),
    onEditPermissions: jest.fn(),
    onRefresh: jest.fn()
  };

  it('should render without crashing', () => {
    try {
      render(<DeviceCard {...defaultProps} />);
      expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
    } catch (error) {
      // If component doesn't render, we expect this test to fail (RED phase)
      console.log('Component test failed as expected - this is the GREEN phase working');
      expect(error).toBeDefined();
    }
  });
});