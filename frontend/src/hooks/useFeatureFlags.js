import { useState } from 'react';

const FLAGS = {
  mobileApp: false,
  labs: false,
  physicalTests: true,
  asap: true,
};

export function useFeatureFlags() {
  const [flags] = useState(FLAGS);
  return flags;
}

export default FLAGS;
