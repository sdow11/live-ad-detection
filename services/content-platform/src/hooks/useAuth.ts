interface User {
  id: string;
  username: string;
  email: string;
}

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

export const useAuth = (): UseAuthReturn => {
  return {
    user: null,
    isAuthenticated: false,
    login: async () => {},
    logout: () => {},
    loading: false
  };
};