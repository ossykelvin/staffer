import Image from "next/image";
import type { AgentProfile } from "@/lib/types";

type AgentAvatarProps = {
  agent: AgentProfile;
  size?: "sm" | "lg";
  priority?: boolean;
};

const sizeClasses = {
  sm: "size-12 rounded-2xl text-sm shadow-lg shadow-blue-950/40",
  lg: "size-24 rounded-3xl text-xl shadow-xl shadow-blue-950/50",
};

const imageSizes = {
  sm: "48px",
  lg: "96px",
};

function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }

  return hash;
}

function generatedStyle(agent: AgentProfile) {
  const seed = agent.avatarSeed || agent.avatarPrompt || agent.id || agent.name;
  const hue = hashValue(seed);

  return {
    background: `linear-gradient(135deg, hsl(${hue} 78% 47%), hsl(${(hue + 42) % 360} 88% 57%))`,
  };
}

export function AgentAvatar({ agent, size = "sm", priority = false }: AgentAvatarProps) {
  const className = sizeClasses[size];

  if (agent.avatarPath && (!agent.avatarMode || agent.avatarMode === "image_path")) {
    return (
      <span className={`relative overflow-hidden border border-white/10 bg-slate-900 ${className}`}>
        <Image src={agent.avatarPath} alt={`${agent.name}, ${agent.jobTitle}`} fill priority={priority} sizes={imageSizes[size]} className="object-cover" />
      </span>
    );
  }

  if (agent.avatarMode === "generated") {
    return (
      <span className={`grid place-items-center border border-white/10 font-bold text-white ${className}`} style={generatedStyle(agent)} title={agent.avatarPrompt}>
        {agent.initials}
      </span>
    );
  }

  return (
    <span className={`grid place-items-center bg-gradient-to-br from-blue-500/90 to-cyan-400/80 font-bold text-white ${className}`}>
      {agent.initials}
    </span>
  );
}
