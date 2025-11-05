export interface ContainerStatus {
  Command: string;
  CreatedAt: string;
  ExitCode: number;
  Health: string;
  ID: string;
  Image: string;
  Labels: string;
  LocalVolumes: string;
  Mounts: string;
  Name: string;
  Names: string;
  Networks: string;
  Ports: string;
  Project: string;
  Publishers: {
    URL: string;
    TargetPort: number;
    PublishedPort: number;
    Protocol: string;
  }[];
  RunningFor: string;
  Service: string;
  Size: string;
  State: "running" | "exited" | "created" | "restarting" | "paused";
  Status: string;
}
