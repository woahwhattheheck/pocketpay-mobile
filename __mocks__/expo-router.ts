const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

export const useRouter = () => ({
  back: mockBack,
  push: mockPush,
  replace: mockReplace,
});

export const useLocalSearchParams = () => ({});

export const useFocusEffect = (callback: () => void | (() => void)) => {
  const React = require('react');
  React.useEffect(callback, [callback]);
};

export const Link = ({ children }: { children: React.ReactNode }) => children;

export default { useRouter, useLocalSearchParams, Link };
