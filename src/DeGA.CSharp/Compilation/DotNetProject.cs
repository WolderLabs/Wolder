using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.Extensions.Logging;

namespace DeGA.CSharp.Compilation;

public class DotNetProject
{
    private static bool s_isInitialized; // TODO: thread safety, with lazy?
    private readonly string _projectPath;
    private readonly ILogger<DotNetProject> _logger;

    public DotNetProject(string path, ILogger<DotNetProject> logger)
    {
        _projectPath = path;
        _logger = logger;
    }

    public string BasePath => Path.GetDirectoryName(_projectPath)!;

    public async Task<bool> TryCompileAsync()
    {
        if (!s_isInitialized)
        {
            s_isInitialized = true;
            MSBuildLocator.RegisterDefaults();
        }

        // Create an instance of MSBuildWorkspace
        var workspace = MSBuildWorkspace.Create();

        // Open the project
        var project = await workspace.OpenProjectAsync(_projectPath);

        // Compile the project
        var compilation = await project.GetCompilationAsync()
            ?? throw new InvalidOperationException("No compilation");

        // Handle errors and warnings
        foreach (var diagnostic in compilation.GetDiagnostics())
        {
            if (diagnostic.Severity == DiagnosticSeverity.Error)
            {
                _logger.LogInformation($"Error: {diagnostic.GetMessage()}");
            }
            else if (diagnostic.Severity == DiagnosticSeverity.Warning)
            {
                _logger.LogInformation($"Warning: {diagnostic.GetMessage()}");
            }
        }

        // Emit the compilation to a DLL or an executable
        var projectRoot = Path.GetDirectoryName(_projectPath)!;
        var binDirectory = Path.Combine(projectRoot, "bin", "generate");
        Directory.CreateDirectory(binDirectory);
        var dllPath = Path.Combine(binDirectory, Path.GetFileNameWithoutExtension(_projectPath) + ".dll");
        var result = compilation.Emit(dllPath);

        return result.Success;
    }
}
