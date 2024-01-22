namespace DeGA.Core
{
    public interface IWorkspaceCommandLine
    {
        Task RunCommandAsync(string command);
    }
}