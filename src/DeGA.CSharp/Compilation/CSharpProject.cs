using Microsoft.Build.Framework;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Generator.CSharp.Compilation
{
    public class CSharpProject
    {
        private static bool s_isInitialized; // TODO: thread safety, with lazy?
        private readonly string _projectPath;
        private readonly ILogger<CSharpProject> _logger;

        public CSharpProject(string path, ILogger<CSharpProject> logger) 
        {
            _projectPath = path;
            _logger = logger;
        }

        public async Task<bool> TryCompileAsync()
        {
            if (!s_isInitialized)
            {
                s_isInitialized = true;
                var msBuildInstance = MSBuildLocator.RegisterDefaults();
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
            var dllPath = Path.ChangeExtension(_projectPath, ".dll");
            var result = compilation.Emit(dllPath);

            return result.Success;
        }
    }
}
