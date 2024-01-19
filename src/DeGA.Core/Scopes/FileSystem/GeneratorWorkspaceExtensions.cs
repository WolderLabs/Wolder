using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.Scopes.FileSystem
{
    public static class GeneratorWorkspaceExtensions
    {
        public static GeneratorWorkspace InRootFolder(this GeneratorWorkspace workspace,
            Action<Generator<FolderScope>> action)
        {
            return workspace;
        }

        public static GeneratorWorkspace InFolder(this GeneratorWorkspace workspace, string relativePath, 
            Action<Generator<FolderScope>> action)
        {
            return workspace;
        }
    }
}
