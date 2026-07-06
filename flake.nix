{
  description = "Development shell for IoT-26-Project";

  inputs = {
    nixpkgs.url = "nixpkgs";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              corepack
              docker-client
              docker-compose
              just
              nodejs_24
              oxfmt
              oxlint
              pnpm_11
              postgresql_18
              sqruff
            ];

            shellHook = ''
              export COMPOSE_FILE="''${COMPOSE_FILE:-compose.dev.yaml}"

              cat <<'EOF'
              IoT-26-Project dev shell
                install deps: just install
                services:     just dev up -d
                ollama model: just ollama pull qwen3:8b
                ui:           just ui

              Host requirements not provided by this shell:
                - a running Docker-compatible daemon
                - AMD ROCm/container GPU access if using GPU_FLAVOR=rocm
              EOF
            '';
          };
        }
      );
    };
}
