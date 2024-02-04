namespace Wolder.Core.Files;

public interface IWorkspaceFileSystem
{
    string RootDirectoryPath { get; }
        
    string GetAbsolutePath(string relativePath);
    Task<string> WriteFileAsync(string name, string text);
    Task<string?> ReadFileAsync(string filePath);
    void CleanDirectory();
}