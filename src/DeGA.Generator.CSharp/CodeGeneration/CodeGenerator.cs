using DeGA.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Generator.CSharp.CodeGeneration
{
    public class CodeGenerator
    {
        private readonly IAIAssistant _assistant;

        public CodeGenerator(IAIAssistant assistant)
        {
            _assistant = assistant;
        }
    }
}
