using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core
{
    public interface IWorkspaceFileSystem
    {
        string RootDirectoryPath { get; }
        
        string GetAbsolutePath(string relativePath);
        Task<string> WriteFileAsync(string name, string text);
        Task<string?> ReadFileAsync(string filePath);
        void CleanDirectory();
    }
}
