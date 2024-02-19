using Microsoft.Extensions.Logging;
using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core.Files;
using Wolder.Core.Workspace;
using Wolder.CSharp.Compilation;

namespace Wolder.CSharp.ProjectActions;

public record CompileProjectParameters(DotNetProjectReference Project);

public class CompileProject(
    ILogger<CompileProject> logger,
    CommandLineActions commandLine,
    ISourceFiles sourceFiles,
    CompileProjectParameters parameters)
    : IAction<CompileProjectParameters, CompilationResult>
{
    public async Task<CompilationResult> InvokeAsync()
    {
        var result = await commandLine.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters("dotnet build",
                relativeWorkingDirectory: parameters.Project.RelativeRoot));
        
        if (result.ExitCode != 0)
        {
            var rootProjectPath = sourceFiles.RootDirectoryPath + "\\";
            var errors = string.Join(
                Environment.NewLine, 
                (result.Output ?? "")
                    .Split(new string[] { "\r\n", "\r", "\n" },
                        StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(l => l.Replace(rootProjectPath, "", StringComparison.OrdinalIgnoreCase))
                    .Where(l => l.Contains("error", StringComparison.OrdinalIgnoreCase)));
            logger.LogInformation("Sanitized Errors:\n {errors}", errors);
            var output = new BuildOutput(result.Output ?? "", "", errors);
            return new CompilationResult.Failure(output);
        }
        
        var successOutput = new BuildOutput(result.Output ?? "", "", result.Output ?? "");
        return new CompilationResult.Success(successOutput);
    }
}