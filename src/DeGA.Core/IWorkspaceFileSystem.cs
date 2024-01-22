using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core
{
    public interface IWorkspaceFileSystem
    {
        string SourceDirectoryPath { get; }

        void EnsureRootDirectory();
        void CleanSourceDirectory();
        string GetAbsolutePath(string relativePath);
        Task<string> WriteFileAsync(string name, string text);
    }
}
