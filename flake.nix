{
  description = "Development shell for IoT-26-Project";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
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
              docker-client
              docker-compose
              just
              nodejs_22
              oxlint
              postgresql_18
              sqruff
            ];

            shellHook = ''
              export COREPACK_HOME="$PWD/.corepack"
              export PNPM_HOME="$PWD/.pnpm-home"
              export PATH="$PWD/.nix-bin:$PNPM_HOME:$PATH"

              mkdir -p "$PWD/.nix-bin" "$COREPACK_HOME" "$PNPM_HOME"
              corepack enable --install-directory "$PWD/.nix-bin" >/dev/null
              corepack prepare pnpm@11.5.0 --activate >/dev/null
            '';
          };
        }
      );
    };
}
