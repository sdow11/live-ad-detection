interface UseWebSocketReturn {
  socket: any;
  isConnected: boolean;
  emit: (event: string, data: any) => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  unsubscribe: (event: string) => void;
}

export const useWebSocket = (): UseWebSocketReturn => {
  return {
    socket: null,
    isConnected: false,
    emit: () => {},
    subscribe: () => () => {},
    unsubscribe: () => {}
  };
};