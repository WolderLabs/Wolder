using System.Diagnostics;
using DeGA.Core.Files;
using Microsoft.Extensions.Logging;

namespace DeGA.CommandLine.Actions;

public class WorkspaceCommandLine(
    ILogger<WorkspaceCommandLine> logger,
    IWorkspaceFileSystem fileSystem) : IWorkspaceCommandLine
{
    public async Task RunCommandAsync(string command)
    {
        var workingDir = fileSystem.RootDirectoryPath;

        // Create a new process to run the command
        using (var process = new Process())
        {
            process.StartInfo.FileName = "cmd.exe";
            process.StartInfo.Arguments = $"/c {command}";
            process.StartInfo.WorkingDirectory = workingDir;
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.RedirectStandardError = true;
            process.StartInfo.CreateNoWindow = true;

            logger.LogInformation("Running: {command}", command);

            process.Start();

            // Read the output (or errors)
            string output = await process.StandardOutput.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(output))
            {
                logger.LogInformation(output);
            }
            string error = await process.StandardError.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(error))
            {
                logger.LogError(error);
            }

            await process.WaitForExitAsync();
        }
    }
}