using Microsoft.Build.Evaluation;
using Microsoft.Build.Execution;
using Microsoft.Build.Framework;
using Microsoft.Build.Locator;
using Microsoft.Build.Logging;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.MSBuild;

namespace Wolder.CSharp.Compilation;

public class DotNetProject(string path, Microsoft.Extensions.Logging.ILogger<DotNetProject> logger) : IDotNetProject
{
    private static int s_isInitialized = 0;

    public Task<CompilationResult> TryCompileAsync()
    {
        if (Interlocked.CompareExchange(ref s_isInitialized, 1, 0) == 0)
        {
            MSBuildLocator.RegisterDefaults();
        }

        var globalProperty = new Dictionary<string, string>
        {
            { "Configuration", "Debug" }
        };

        var buildLogger = new BuildLogger(logger);
        var buildParameters = new BuildParameters(ProjectCollection.GlobalProjectCollection)
        {
            Loggers = new List<ILogger> { buildLogger }
        };

        var buildRequest = new BuildRequestData(
            path, globalProperty, null, new string[] { "Build" }, null);

        var result = BuildManager.DefaultBuildManager.Build(buildParameters, buildRequest);
        var buildOutput = buildLogger.GetOutput();

        if (result.OverallResult == BuildResultCode.Success)
        {
            return Task.FromResult<CompilationResult>(new CompilationResult.Success(buildOutput));
        }
        return Task.FromResult<CompilationResult>(new CompilationResult.Failure(buildOutput));
    }
}

public interface IDotNetProject
{
    Task<CompilationResult> TryCompileAsync();
}
