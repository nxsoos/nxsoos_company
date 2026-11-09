// Decorative idle life only: these schedules never change an agent's real work status.
export function idleBreak(roleIndex: number, sequence: number) {
  const variation = (roleIndex * 47 + sequence * 71) % 121;
  return {
    activity: (roleIndex + sequence) % 2 ? ('tv' as const) : ('coffee' as const),
    delay: sequence === 0 ? 120 + roleIndex * 37 : 180 + variation,
    duration: (roleIndex + sequence) % 2 ? 35 + (variation % 21) : 18 + (variation % 13),
  };
}
