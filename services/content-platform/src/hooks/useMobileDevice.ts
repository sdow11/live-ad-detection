import { useState, useCallback } from 'react';

interface MobileDevice {
  id: string;
  deviceId: string;
  name: string;
  model: string;
  os: string;
  osVersion: string;
  appVersion: string;
  capabilities: string[];
  isPaired: boolean;
  isOnline: boolean;
  lastSeen: Date;
  batteryLevel: number;
  networkType: string;
}

interface PairingSession {
  code: string;
  qrCodeDataURL: string;
  expiresAt: Date;
}

interface UseMobileDeviceReturn {
  devices: MobileDevice[];
  loading: boolean;
  error: string | null;
  generatePairingCode: () => Promise<PairingSession>;
  pairDevice: (deviceData: any) => Promise<{ success: boolean; device?: any }>;
  unpairDevice: (deviceId: string) => Promise<{ success: boolean }>;
  refreshDevices: () => Promise<void>;
  currentPairingSession: PairingSession | null;
}

export const useMobileDevice = (): UseMobileDeviceReturn => {
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPairingSession, setCurrentPairingSession] = useState<PairingSession | null>(null);

  const generatePairingCode = useCallback(async (): Promise<PairingSession> => {
    setLoading(true);
    try {
      // Mock implementation - in real app would call API
      const session = {
        code: 'ABC123',
        qrCodeDataURL: 'data:image/png;base64,mockqrcode',
        expiresAt: new Date(Date.now() + 300000) // 5 minutes
      };
      setCurrentPairingSession(session);
      return session;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const pairDevice = useCallback(async (deviceData: any): Promise<{ success: boolean; device?: any }> => {
    try {
      // Mock implementation
      return { success: true, device: deviceData };
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const unpairDevice = useCallback(async (deviceId: string): Promise<{ success: boolean }> => {
    try {
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const refreshDevices = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Mock implementation - would fetch from API
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    devices,
    loading,
    error,
    generatePairingCode,
    pairDevice,
    unpairDevice,
    refreshDevices,
    currentPairingSession
  };
};