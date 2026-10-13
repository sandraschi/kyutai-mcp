# Per-repo fleet start config for kyutai-mcp
# Edit ports/backend target here - start.ps1 is fleet-standard.
@{
    Name         = 'kyutai-mcp'
    BackendPort  = 10924
    FrontendPort = 10925
    HealthPath   = '/api/health'
    WebRoot      = 'webapp\frontend'
    Backend = @{
        Kind          = 'uvicorn-web-app'
        UvicornTarget = 'app:app'
        WorkDir       = 'webapp\backend'
        Env           = @{ WEB_PORT = '10924' }
    }
    Frontend = @{
        Kind           = 'vite-npm'
        PackageManager = 'npm'
        PortEnvVar     = 'VITE_PORT'
        ApiTargetEnv   = 'VITE_API_TARGET'
    }
}
