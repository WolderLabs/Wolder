using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.CommandLine.Actions;

public record ExecuteCommandLineParameters(
    string command,
    string relativeWorkingDirectory = "",
    bool Interactive = false);

public record ExecuteCommandLineOutput(string? Output, string? Errors, int ExitCode);

public class ExecuteCommandLine(
    ExecuteCommandLineParameters parameters,
    ILogger<ExecuteCommandLine> logger,
    ISourceFiles sourceFiles)
    : IAction<ExecuteCommandLineParameters, ExecuteCommandLineOutput>
{
    public async Task<ExecuteCommandLineOutput> InvokeAsync()
    {
        var (command, relativeDirectory, interactive) = parameters;
        var workingDir = Path.Combine(sourceFiles.RootDirectoryPath, relativeDirectory);
        Directory.CreateDirectory(workingDir);

        // Create a new process to run the command
        using var process = new Process();
        process.StartInfo.FileName = "cmd.exe";
        process.StartInfo.Arguments = $"/c {command}";
        process.StartInfo.WorkingDirectory = workingDir;
        process.StartInfo.UseShellExecute = interactive;
        if (!interactive)
        {
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.RedirectStandardError = true;
        }

        process.StartInfo.CreateNoWindow = true;

        logger.LogInformation("Running: {command}", command);

        process.Start();

        string? output = null;
        string? error = null;

        // Read the output (or errors)
        if (!interactive)
        {
            output = await process.StandardOutput.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(output))
            {
                logger.LogInformation("ShellOut: {output}", output);
            }

            error = await process.StandardError.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(error))
            {
                logger.LogError("ShellError: {error}", error);
            }
        }

        await process.WaitForExitAsync();

        return new ExecuteCommandLineOutput(output, error, process.ExitCode);
    }
}