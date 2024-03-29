﻿using System.Text;

namespace Wolder.Core.Files;

public class WorkspaceFileSystem : IWorkspaceFileSystem
{
    private readonly Lazy<string> _lazyRootPath;
    
    public WorkspaceFileSystem(
       WorkspaceRootPath pipelineRootPath, string relativePath = "")
    {
        var workingDirectory = Environment.CurrentDirectory;
        var workspaceDirectory = Directory.GetParent(workingDirectory)?.Parent?.Parent?.Parent?.FullName;
        if (workspaceDirectory == null)
        {
            throw new InvalidOperationException("Could not find root directory.");
        }

        // Use lazily to ensure the path can be set before it's needed
        _lazyRootPath = new Lazy<string>(
            () =>
            {
                var path = Path.Combine(workspaceDirectory, pipelineRootPath.Path, relativePath);
                Directory.CreateDirectory(path);
                return path;
            });
    }

    public string RootDirectoryPath => _lazyRootPath.Value;

    public void CleanDirectory()
    {
        if (Directory.Exists(RootDirectoryPath))
        {
            Directory.Delete(RootDirectoryPath, true);
        }
        Directory.CreateDirectory(RootDirectoryPath);
    }

    public async Task<string> WriteFileAsync(string name, string text)
    {
        string filePath = NormalizePath(name);
        await File.WriteAllTextAsync(filePath, text);
        return filePath;
    }

    public async Task<string?> ReadFileAsync(string name)
    {
        string filePath = NormalizePath(name);
        if (!File.Exists(filePath))
        {
            return null;
        }
        return await File.ReadAllTextAsync(filePath);
    }

    public string GetAbsolutePath(string relativePath)
    {
        string filePath = Path.Combine(RootDirectoryPath, relativePath);
        return filePath;
    }

    private string NormalizePath(string name)
    {
        name = name.Trim().TrimStart('/', '\\');
        string filePath = Path.Combine(RootDirectoryPath, name);
        var directory = Path.GetDirectoryName(filePath)!;
        Directory.CreateDirectory(directory);
        return filePath;
    }
    
    public string GetDirectoryTree(string relativePath)
    {
        var treeBuilder = new StringBuilder();
        var rootPath = GetAbsolutePath(relativePath);

        // Start the recursive method to build the directory tree string
        BuildDirectoryTree(rootPath, "", treeBuilder);

        string tree = treeBuilder.ToString();
        return tree;
    }

    static void BuildDirectoryTree(string directoryPath, string indent, StringBuilder treeBuilder)
    {
        try
        {
            // Get all directories in the current directory
            string[] directories = Directory.GetDirectories(directoryPath);

            foreach (string directory in directories)
            {
                // Skip bin and obj directories
                if (directory.EndsWith("\\bin") || directory.EndsWith("\\obj"))
                {
                    continue;
                }

                treeBuilder.AppendLine($"{indent}+ {new DirectoryInfo(directory).Name}");
                // Recursively build the string for the contents of this directory
                BuildDirectoryTree(directory, indent + "  ", treeBuilder);
            }

            // Get all files in the current directory
            string[] files = Directory.GetFiles(directoryPath);

            foreach (string file in files)
            {
                treeBuilder.AppendLine($"{indent}- {Path.GetFileName(file)}");
            }
        }
        catch (UnauthorizedAccessException)
        {
            treeBuilder.AppendLine($"{indent}! Access Denied");
        }
    }
}