using System.Diagnostics;
using Wolder.Core.Files;
using Wolder.Core.Pipeline;
using Microsoft.Extensions.Logging;

namespace Wolder.CommandLine.Actions;

public class RunCommandActivity(
    ILogger<RunCommandActivity> logger,
    ISourceFiles sourceFiles) : PipelineActivity<RunCommand, string>
{
    protected override async Task<string> ExecuteAsync(IPipelineActionContext context, RunCommand parameters)
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

        // Read the output (or errors)
        if (!interactive)
        {
            string output = await process.StandardOutput.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(output))
            {
                logger.LogInformation("ShellOut: {output}", output);
            }

            string error = await process.StandardError.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(error))
            {
                logger.LogError("ShellError: {error}", error);
            }
        }

        await process.WaitForExitAsync();
        return "done";
    }
}