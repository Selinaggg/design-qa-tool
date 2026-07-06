import type { DeviceProfile } from './types';

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: 'iphone-14',
    name: 'iPhone 14',
    platform: 'ios',
    viewport: { width: 390, height: 844 },
    safeArea: { top: 47, bottom: 34, left: 0, right: 0 },
  },
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    platform: 'ios',
    viewport: { width: 393, height: 852 },
    safeArea: { top: 59, bottom: 34, left: 0, right: 0 },
  },
  {
    id: 'pixel-7',
    name: 'Pixel 7',
    platform: 'android',
    viewport: { width: 412, height: 915 },
    safeArea: { top: 24, bottom: 24, left: 0, right: 0 },
  },
  {
    id: 'samsung-s23',
    name: 'Samsung S23',
    platform: 'android',
    viewport: { width: 360, height: 780 },
    safeArea: { top: 24, bottom: 24, left: 0, right: 0 },
  },
];

export const IOS_DEVICES = DEVICE_PROFILES.filter((d) => d.platform === 'ios');
export const ANDROID_DEVICES = DEVICE_PROFILES.filter((d) => d.platform === 'android');

export const DEFAULT_IOS_DEVICE = IOS_DEVICES[0];     // iPhone 14
export const DEFAULT_ANDROID_DEVICE = ANDROID_DEVICES[0]; // Pixel 7
