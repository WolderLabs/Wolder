namespace DeGA.CommandLine.Actions;

public interface IWorkspaceCommandLine
{
    Task RunCommandAsync(string command);
}